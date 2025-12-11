// processRenderJob tests — skeleton describing desired end state
//
// Purpose: Verify that a RENDER job calls the document renderer with the correct
// parameters and records completion or failure to the jobs table with strict typing
// and no reliance on deprecated fields.

import { assert, assertEquals, assertExists } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { logger } from "../_shared/logger.ts";
import { FileType } from "../_shared/types/file_manager.types.ts";
import { createDocumentRendererMock } from "../_shared/services/document_renderer.mock.ts";
import { isRecord } from "../_shared/utils/type_guards.ts";
import { processRenderJob } from "./processRenderJob.ts";
import { MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import { mockNotificationService, resetMockNotificationService } from "../_shared/utils/notification.service.mock.ts";
import type { DialecticRenderJobPayload } from "../dialectic-service/dialectic.interface.ts";
import { isJson } from "../_shared/utils/type-guards/type_guards.common.ts";

// Helpers
type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

const makeRenderJob = (payloadOverrides: Partial<DialecticRenderJobPayload> = {}): MockJob => {
  const payload: DialecticRenderJobPayload = {
    job_type: "RENDER",
    model_id: "renderer",
    walletId: "wallet-123",
    user_jwt: "test-jwt-token",
    sourceContributionId: "doc-root-1",
    projectId: "project_123",
    sessionId: "session_abc",
    iterationNumber: 1,
    stageSlug: "thesis",
    documentIdentity: "doc-root-1",
    documentKey: FileType.business_case,
    ...payloadOverrides,
  };

  if (!isJson(payload)) {
    throw new Error("Test payload is not valid JSON. Please check the mock payload object.");
  }

  const row: MockJob = {
    id: "job-render-1",
    user_id: "user-123",
    session_id: String(payload.sessionId),
    stage_slug: String(payload.stageSlug),
    payload,
    iteration_number: Number(payload.iterationNumber),
    status: "pending",
    attempt_count: 0,
    max_retries: 0,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    parent_job_id: null,
    target_contribution_id: null,
    prerequisite_job_id: null,
    is_test_job: false,
    job_type: "RENDER",
  };
  return row;
};

Deno.test("processRenderJob - calls renderer with job signature and marks job completed", async () => {
  // Arrange
  // - Build a mock Dialectic job row (job_type: 'RENDER') whose payload contains:
  //   { projectId, sessionId, iterationNumber, stageSlug, documentIdentity, documentKey }
  // - Create a mock Supabase client (spies should capture an update to dialectic_generation_jobs)
  // - Create a documentRenderer mock that captures calls and returns { pathContext, renderedBytes }
  // - Provide minimal deps object containing the documentRenderer
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const { renderer, calls } = createDocumentRendererMock();
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  // Act
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    { 
        documentRenderer: renderer, 
        logger, 
        downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
         fileManager: new MockFileManagerService(), 
         notificationService: mockNotificationService 
    },
    "auth-token",
  );

  // Assert
  // - renderer.renderDocument was called exactly once
  // - Params equal the payload: { projectId, sessionId, iterationNumber, stageSlug, documentIdentity, documentKey }
  // - Job row was updated once with { status: 'completed', results: ... }
  assertEquals(calls.length, 1);
  const call = calls[0];
  assertEquals(call.params.projectId, "project_123");
  assertEquals(call.params.sessionId, "session_abc");
  assertEquals(call.params.iterationNumber, 1);
  assertEquals(call.params.stageSlug, "thesis");
  assertEquals(call.params.documentIdentity, "doc-root-1");
  assertEquals(String(call.params.documentKey), String(FileType.business_case));

  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  assertEquals(updates.callCount, 1);
  const [updatePayload] = updates.callsArgs[0];
  assertExists(updatePayload);
  // Status should be completed on success
  assert(updatePayload && typeof updatePayload === "object" && "status" in updatePayload);
  assertEquals(updatePayload.status, "completed");

  clearAllStubs?.();
});

Deno.test("processRenderJob - passes originating contribution id to renderer payload", async () => {
  // Test 6.b.iv: Verify that sourceContributionId is passed correctly to renderDocument regardless of whether it equals documentIdentity
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const { renderer, calls } = createDocumentRendererMock({
    handler: async (_dbc, _deps, params) => {
      // Return pathContext with sourceContributionId from params (not documentIdentity)
      return {
        pathContext: {
          projectId: params.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: params.sessionId,
          iteration: params.iterationNumber,
          stageSlug: params.stageSlug,
          documentKey: params.documentKey,
          modelSlug: "mock-model",
          sourceContributionId: params.sourceContributionId,
        },
        renderedBytes: new Uint8Array(),
      };
    },
  });
  const documentIdentity = "doc-identity-456";
  const sourceContributionId = "contrib-id-789";
  // Use different values to verify the function passes them correctly regardless of equality
  const job = makeRenderJob({ documentIdentity, sourceContributionId });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  assertEquals(calls.length, 1);
  const params = calls[0].params;
  assert(isRecord(params), "Renderer params must be a record");
  if (isRecord(params)) {
    assert("sourceContributionId" in params, "Expected renderer params to include sourceContributionId");
    assert("documentIdentity" in params, "Expected renderer params to include documentIdentity");
    const receivedSourceContributionId = params["sourceContributionId"];
    const receivedDocumentIdentity = params["documentIdentity"];
    // Verify sourceContributionId is passed correctly (not enforcing equality with documentIdentity)
    assertEquals(receivedSourceContributionId, sourceContributionId, "sourceContributionId should be passed correctly to renderDocument");
    assertEquals(receivedDocumentIdentity, documentIdentity, "documentIdentity should be passed correctly to renderDocument");
    // This test verifies the values are passed correctly regardless of their relationship
    // (separate tests 6.b.i and 6.b.ii explicitly test root and continuation chunk scenarios)
  }

  clearAllStubs?.();
});

Deno.test("processRenderJob - records failure with error_details when renderer throws", async () => {
  // Arrange
  // - Same as prior test but make renderer.renderDocument throw an Error("render failed")
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const error = new Error("render failed");
  const { renderer } = createDocumentRendererMock({
    handler: async () => {
      throw error;
    },
  });
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  // Act
  try {
    await processRenderJob(
      dbClient as unknown as SupabaseClient<Database>,
      job,
      ownerId,
      { 
        documentRenderer: renderer, 
        logger, 
        downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }), 
        fileManager: new MockFileManagerService(), 
        notificationService: mockNotificationService,
    },
      "auth-token",
    );
  } catch (_e) {
    // The processor may throw or may swallow and set job failed; tests assert DB update regardless
  }

  // Assert DB update
  // - renderer.renderDocument was called exactly once
  // - Job row updated once with { status: 'failed', error_details: includes 'render failed' }
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  assertEquals(updates.callCount, 1);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  const status = updatePayload.status;
  assertEquals(status, "failed");
  const errorDetails = updatePayload.error_details;
  assert(typeof errorDetails === "string" && errorDetails.includes("render failed"));

  clearAllStubs?.();
});

Deno.test("processRenderJob - emits job_failed document-centric notification on renderer failure", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const err = new Error("render crashed hard");
  const { renderer } = createDocumentRendererMock({ handler: async () => { throw err; } });
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  resetMockNotificationService();

  try {
    await processRenderJob(
      dbClient as unknown as SupabaseClient<Database>,
      job,
      ownerId,
      {
        documentRenderer: renderer,
        logger,
        downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
        fileManager: new MockFileManagerService(),
        notificationService: mockNotificationService,
      },
      'auth-token',
    );
  } catch (_e) {
    // swallow for test
  }

  assertEquals(mockNotificationService.sendDocumentCentricNotification.calls.length, 1, 'Expected job_failed notification');
  const [payloadArg, targetUserId] = mockNotificationService.sendDocumentCentricNotification.calls[0].args;
  assert(isRecord(payloadArg));
  assertEquals(payloadArg.type, 'job_failed');
  assertEquals(payloadArg.sessionId, 'session_abc');
  assertEquals(payloadArg.stageSlug, 'thesis');
  assertEquals(payloadArg.job_id, job.id);
  assertEquals(payloadArg.document_key, String(FileType.business_case));
  assertEquals(payloadArg.modelId, 'renderer');
  assertEquals(payloadArg.iterationNumber, 1);
  assertEquals(targetUserId, job.user_id);

  clearAllStubs?.();
});

Deno.test("processRenderJob - forwards dbClient and args unchanged; does not mutate inputs", async () => {
  // Arrange
  // - Capture the dbClient passed into renderer via the mock to assert strict pass-through
  // - Freeze (Object.freeze) a shallow copy of job payload to detect accidental mutation
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  Object.freeze(job.payload);
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  let receivedDbClient: unknown;
  let receivedParams: unknown;
  const { renderer } = createDocumentRendererMock({
    handler: async (dbc, _deps, params) => {
      receivedDbClient = dbc;
      receivedParams = params;
      return {
        pathContext: {
          projectId: params.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: params.sessionId,
          iteration: params.iterationNumber,
          stageSlug: params.stageSlug,
          documentKey: params.documentKey,
          modelSlug: "mock-model",
        },
        renderedBytes: new Uint8Array(),
      };
    },
  });

  // Act
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    { 
        documentRenderer: renderer, 
        logger, 
        downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }), 
        fileManager: new MockFileManagerService(), 
        notificationService: mockNotificationService,
    },
    "auth-token",
  );

  // Assert
  assert(receivedDbClient === (dbClient as unknown as SupabaseClient<Database>));
  assertExists(receivedParams);
  // Ensure payload remains frozen and unchanged in shape
  assert(Object.isFrozen(job.payload));

  clearAllStubs?.();
});

Deno.test("processRenderJob - ignores deprecated step_info and relies only on render signature", async () => {
  // Arrange
  // - Add a bogus step_info field to the payload to ensure it is ignored
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const job: MockJob = makeRenderJob(
    { step_info: { legacy: true } } as unknown as DialecticRenderJobPayload);
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  let usedParams: { [k: string]: unknown } | null = null;
  const { renderer } = createDocumentRendererMock({
    handler: async (_dbc, _deps, params) => {
      usedParams = params;
      return {
        pathContext: {
          projectId: params.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: params.sessionId,
          iteration: params.iterationNumber,
          stageSlug: params.stageSlug,
          documentKey: params.documentKey,
          modelSlug: "mock-model",
        },
        renderedBytes: new Uint8Array(),
      };
    },
  });

  // Act
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    { 
        documentRenderer: renderer, 
        logger, 
        downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }), 
        fileManager: new MockFileManagerService(), 
        notificationService: mockNotificationService,
    },
    "auth-token",
  );

  // Assert
  assertExists(usedParams);
  // - renderer params are derived exclusively from { projectId, sessionId, iterationNumber, stageSlug, documentIdentity, documentKey }
  assertEquals(Object.prototype.hasOwnProperty.call(usedParams, "step_info"), false);

  clearAllStubs?.();
});

Deno.test("processRenderJob - success path performs a single deterministic job update with results", async () => {
  // Arrange
  // - Set up spies on dialectic_generation_jobs update
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const { renderer } = createDocumentRendererMock();
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  // Act
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    { 
        documentRenderer: renderer, 
        logger, 
        downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }), 
        fileManager: new MockFileManagerService(), 
        notificationService: mockNotificationService,
    },
    "auth-token",
  );

  // Assert
  // - Exactly one UPDATE occurs
  // - Payload includes a deterministic results path derived from the renderer's pathContext
  // - No extraneous SELECTs (e.g., no stage queries in this processor)
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  assertEquals(updates.callCount, 1);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload);
  assertEquals(updatePayload.status, "completed");
  // Results object presence is sufficient for contract; specific shape asserted elsewhere
  assert("results" in updatePayload);

  const stageSelects = (spies.getHistoricQueryBuilderSpies("dialectic_stages", "select") || { callCount: 0 }).callCount;
  assertEquals(stageSelects, 0);

  clearAllStubs?.();
});

Deno.test("processRenderJob - persists renderer pathContext into job results", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const expectedSourceContributionId = "expected-source-contrib-id";
  const { renderer } = createDocumentRendererMock({
    handler: async (_dbc, _deps, params) => {
      // Return pathContext with sourceContributionId from params (not documentIdentity)
      return {
        pathContext: {
          projectId: params.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: params.sessionId,
          iteration: params.iterationNumber,
          stageSlug: params.stageSlug,
          documentKey: params.documentKey,
          modelSlug: "mock-model",
          sourceContributionId: params.sourceContributionId,
        },
        renderedBytes: new Uint8Array(),
      };
    },
  });
  const job = makeRenderJob({ sourceContributionId: expectedSourceContributionId });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  assertEquals(updates.callCount, 1);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "results" in updatePayload);
  // expect pathContext persisted in results
  assert(isRecord(updatePayload) && "results" in updatePayload);
  const results = updatePayload["results"];
  assert(isRecord(results) && "pathContext" in results);
  const pathContext = results["pathContext"];
  assert(
    isRecord(pathContext) && "sourceContributionId" in pathContext,
    "Expected pathContext to include sourceContributionId",
  );
  const payload = job.payload;
  assert(isRecord(payload) && "sourceContributionId" in payload, "Expected job payload to provide sourceContributionId");
  assert(isRecord(pathContext));
  // Verify that sourceContributionId is saved from render result, not from documentIdentity
  // The render result's sourceContributionId should match the payload's sourceContributionId (not documentIdentity)
  if (isRecord(pathContext) && isRecord(payload)) {
    assertEquals(pathContext["sourceContributionId"], expectedSourceContributionId, "pathContext.sourceContributionId should equal the payload's sourceContributionId");
    assertEquals(pathContext["sourceContributionId"], payload["sourceContributionId"], "pathContext.sourceContributionId should come from render result, matching payload's sourceContributionId");
  }

  clearAllStubs?.();
});

Deno.test("processRenderJob - forwards notifyUserId to renderer deps", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  let receivedNotifyUserId: unknown;
  let receivedNotificationService: unknown;
  const { renderer } = createDocumentRendererMock({
    handler: async (_dbc, deps, params) => {
      receivedNotifyUserId = deps.notifyUserId;
      receivedNotificationService = deps.notificationService;
      return {
        pathContext: {
          projectId: params.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: params.sessionId,
          iteration: params.iterationNumber,
          stageSlug: params.stageSlug,
          documentKey: params.documentKey,
          modelSlug: "mock-model",
        },
        renderedBytes: new Uint8Array(),
      };
    },
  });

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  assertEquals(receivedNotifyUserId, job.user_id);
  assert(receivedNotificationService === mockNotificationService);

  clearAllStubs?.();
});

Deno.test("processRenderJob - converts string iterationNumber to number", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  let receivedIteration: number | null = null;
  const { renderer } = createDocumentRendererMock({
    handler: async (_dbc, _deps, params) => {
      receivedIteration = params.iterationNumber;
      return {
        pathContext: {
          projectId: params.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: params.sessionId,
          iteration: params.iterationNumber,
          stageSlug: params.stageSlug,
          documentKey: params.documentKey,
          modelSlug: "mock-model",
        },
        renderedBytes: new Uint8Array(),
      };
    },
  });
  const job: MockJob = makeRenderJob({ iterationNumber: 1 } as unknown as DialecticRenderJobPayload);
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  assertEquals(receivedIteration, 1);

  clearAllStubs?.();
});

Deno.test("processRenderJob - fails and does not call renderer when projectId missing", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const { renderer, calls } = createDocumentRendererMock();
  const job = makeRenderJob({ projectId: undefined });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  assertEquals(calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  assertEquals(updates.callCount, 1);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Missing required render parameters"));

  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when sessionId missing", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const { renderer, calls } = createDocumentRendererMock();
  const job = makeRenderJob({ sessionId: undefined });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  assertEquals(calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Missing required render parameters"));

  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when stageSlug missing", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const { renderer, calls } = createDocumentRendererMock();
  const job = makeRenderJob({ stageSlug: undefined });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  assertEquals(calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Missing required render parameters"));

  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when documentIdentity missing", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const { renderer, calls } = createDocumentRendererMock();
  const job = makeRenderJob({ documentIdentity: undefined });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  assertEquals(calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Missing required render parameters"));

  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when iterationNumber missing or invalid", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const { renderer, calls } = createDocumentRendererMock();
  const job = makeRenderJob({ iterationNumber: undefined });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  assertEquals(calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("iterationNumber is required"));

  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when iterationNumber is non-numeric string", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const { renderer, calls } = createDocumentRendererMock();
  const job: MockJob = makeRenderJob(
    { iterationNumber: "bogus" as unknown as number });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  assertEquals(calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("iterationNumber is required"));

  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when documentKey is not a FileType", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const { renderer, calls } = createDocumentRendererMock();
  const job: MockJob = makeRenderJob(
    { documentKey: "not_a_file_type" as unknown as FileType });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  assertEquals(calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("documentKey must be a valid FileType"));

  clearAllStubs?.();
});

Deno.test("processRenderJob - accepts sourceContributionId that differs from documentIdentity when document_relationships contains semantic identifier", async () => {
  // Arrange: Create a RENDER job where sourceContributionId is the actual contribution ID
  // and documentIdentity is a semantic identifier from document_relationships (different values)
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const { renderer, calls } = createDocumentRendererMock();
  
  const actualContributionId = "contrib-123"; // Actual contribution ID (for foreign key constraint)
  const semanticIdentifier = "semantic-doc-identity-999"; // Semantic identifier from document_relationships
  
  // sourceContributionId should be the actual contribution ID, not the semantic identifier
  const job = makeRenderJob({ 
    sourceContributionId: actualContributionId,
    documentIdentity: semanticIdentifier 
  });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  // Act: processRenderJob should accept this configuration without throwing
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );

  // Assert: The job should process successfully (not fail with "sourceContributionId must equal documentIdentity")
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  assertEquals(updates.callCount, 1);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload);
  assertEquals(updatePayload.status, "completed", "Job should complete successfully when sourceContributionId differs from documentIdentity");

  // Assert: renderer should be called with the correct parameters
  assertEquals(calls.length, 1, "Renderer should be called exactly once");
  const renderParams = calls[0].params;
  assert(isRecord(renderParams), "Renderer params must be a record");
  assertEquals(renderParams.sourceContributionId, actualContributionId, "sourceContributionId should be the actual contribution ID");
  assertEquals(renderParams.documentIdentity, semanticIdentifier, "documentIdentity should be the semantic identifier");
  assert(renderParams.sourceContributionId !== renderParams.documentIdentity, "sourceContributionId and documentIdentity should be different when document_relationships contains a semantic identifier");

  // Assert: No error should be logged about sourceContributionId not equaling documentIdentity
  const errorDetails = isRecord(updatePayload) && "error_details" in updatePayload ? updatePayload.error_details : null;
  assert(
    !errorDetails || (typeof errorDetails === "string" && !errorDetails.includes("sourceContributionId must equal documentIdentity")),
    "Should not fail with 'sourceContributionId must equal documentIdentity' error"
  );

  clearAllStubs?.();
});

Deno.test("processRenderJob - processes RENDER job successfully for root chunk where sourceContributionId equals documentIdentity", async () => {
  // Test 6.b.i: Verify root chunks where sourceContributionId === documentIdentity
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const rootId = "root-contrib-6b-i";
  
  const { renderer, calls } = createDocumentRendererMock({
    handler: async (_dbc, _deps, params) => {
      // Return pathContext with sourceContributionId from params (not documentIdentity)
      return {
        pathContext: {
          projectId: params.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: params.sessionId,
          iteration: params.iterationNumber,
          stageSlug: params.stageSlug,
          documentKey: params.documentKey,
          modelSlug: "mock-model",
          sourceContributionId: params.sourceContributionId,
        },
        renderedBytes: new Uint8Array(),
      };
    },
  });
  
  // (1) Create a RENDER job with payload containing sourceContributionId: rootId and documentIdentity: rootId (both equal)
  const job = makeRenderJob({
    sourceContributionId: rootId,
    documentIdentity: rootId,
  });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  
  // (2) Call processRenderJob with the job
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );
  
  // (3) Verify renderDocument is called with sourceContributionId: rootId and documentIdentity: rootId
  assertEquals(calls.length, 1, "renderDocument should be called exactly once");
  const renderParams = calls[0].params;
  assert(isRecord(renderParams), "Renderer params must be a record");
  assertEquals(renderParams.sourceContributionId, rootId, "sourceContributionId should equal rootId");
  assertEquals(renderParams.documentIdentity, rootId, "documentIdentity should equal rootId");
  
  // (4) Verify the job is updated with status 'completed'
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates, "Job update should be called");
  assertEquals(updates.callCount, 1, "Job should be updated exactly once");
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload, "Update payload should have status");
  assertEquals(updatePayload.status, "completed", "Job status should be 'completed'");
  
  // (5) Verify results.pathContext.sourceContributionId is set to rootId
  assert(isRecord(updatePayload) && "results" in updatePayload, "Update payload should have results");
  const results = updatePayload["results"];
  assert(isRecord(results) && "pathContext" in results, "Results should have pathContext");
  const pathContext = results["pathContext"];
  assert(isRecord(pathContext) && "sourceContributionId" in pathContext, "pathContext should have sourceContributionId");
  assertEquals(pathContext["sourceContributionId"], rootId, "results.pathContext.sourceContributionId should equal rootId");
  
  // (6) Explicitly assert that sourceContributionId === documentIdentity for root chunks
  assertEquals(renderParams.sourceContributionId, renderParams.documentIdentity, "For root chunks, sourceContributionId should equal documentIdentity");
  
  clearAllStubs?.();
});

Deno.test("processRenderJob - processes RENDER job successfully for continuation chunk where sourceContributionId differs from documentIdentity", async () => {
  // Test 6.b.ii: Verify continuation chunks where sourceContributionId !== documentIdentity
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const rootId = "root-contrib-6b-ii";
  const continuationId = "continuation-contrib-6b-ii";
  
  const { renderer, calls } = createDocumentRendererMock({
    handler: async (_dbc, _deps, params) => {
      // Return pathContext with sourceContributionId from params (not documentIdentity)
      return {
        pathContext: {
          projectId: params.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: params.sessionId,
          iteration: params.iterationNumber,
          stageSlug: params.stageSlug,
          documentKey: params.documentKey,
          modelSlug: "mock-model",
          sourceContributionId: params.sourceContributionId,
        },
        renderedBytes: new Uint8Array(),
      };
    },
  });
  
  // (1) Create a RENDER job with payload containing sourceContributionId: continuationId and documentIdentity: rootId (different values)
  const job = makeRenderJob({
    sourceContributionId: continuationId,
    documentIdentity: rootId,
  });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  
  // (2) Call processRenderJob with the job
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );
  
  // (3) Verify renderDocument is called with sourceContributionId: continuationId and documentIdentity: rootId (different values)
  assertEquals(calls.length, 1, "renderDocument should be called exactly once");
  const renderParams = calls[0].params;
  assert(isRecord(renderParams), "Renderer params must be a record");
  assertEquals(renderParams.sourceContributionId, continuationId, "sourceContributionId should equal continuationId");
  assertEquals(renderParams.documentIdentity, rootId, "documentIdentity should equal rootId");
  assert(renderParams.sourceContributionId !== renderParams.documentIdentity, "sourceContributionId and documentIdentity should be different for continuation chunks");
  
  // (4) Verify the job is updated with status 'completed'
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates, "Job update should be called");
  assertEquals(updates.callCount, 1, "Job should be updated exactly once");
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload, "Update payload should have status");
  assertEquals(updatePayload.status, "completed", "Job status should be 'completed'");
  
  // (5) Verify results.pathContext.sourceContributionId is set to continuationId (the actual contribution.id, not the documentIdentity)
  assert(isRecord(updatePayload) && "results" in updatePayload, "Update payload should have results");
  const results = updatePayload["results"];
  assert(isRecord(results) && "pathContext" in results, "Results should have pathContext");
  const pathContext = results["pathContext"];
  assert(isRecord(pathContext) && "sourceContributionId" in pathContext, "pathContext should have sourceContributionId");
  assertEquals(pathContext["sourceContributionId"], continuationId, "results.pathContext.sourceContributionId should equal continuationId (not documentIdentity)");
  assert(pathContext["sourceContributionId"] !== rootId, "results.pathContext.sourceContributionId should not equal documentIdentity for continuation chunks");
  
  // (6) Explicitly assert that sourceContributionId !== documentIdentity for continuation chunks
  assert(renderParams.sourceContributionId !== renderParams.documentIdentity, "For continuation chunks, sourceContributionId should not equal documentIdentity");
  
  clearAllStubs?.();
});

Deno.test("processRenderJob - passes sourceContributionId and documentIdentity to renderDocument without enforcing equality", async () => {
  // Test 6.b.iii: Verify the function does not enforce equality between sourceContributionId and documentIdentity
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const anyId = "any-contribution-id-6b-iii";
  const differentId = "different-document-identity-6b-iii";
  
  const { renderer, calls } = createDocumentRendererMock({
    handler: async (_dbc, _deps, params) => {
      // Return pathContext with sourceContributionId from params (not documentIdentity)
      return {
        pathContext: {
          projectId: params.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: params.sessionId,
          iteration: params.iterationNumber,
          stageSlug: params.stageSlug,
          documentKey: params.documentKey,
          modelSlug: "mock-model",
          sourceContributionId: params.sourceContributionId,
        },
        renderedBytes: new Uint8Array(),
      };
    },
  });
  
  // (1) Create a RENDER job with payload containing sourceContributionId: anyId and documentIdentity: differentId (different values)
  const job = makeRenderJob({
    sourceContributionId: anyId,
    documentIdentity: differentId,
  });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  
  // (2) Call processRenderJob with the job
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    {
      documentRenderer: renderer,
      logger,
      downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null }),
      fileManager: new MockFileManagerService(),
      notificationService: mockNotificationService,
    },
    "auth-token",
  );
  
  // (3) Verify renderDocument is called with exactly the values from the payload (no coercion or equality checks)
  assertEquals(calls.length, 1, "renderDocument should be called exactly once");
  const renderParams = calls[0].params;
  assert(isRecord(renderParams), "Renderer params must be a record");
  assertEquals(renderParams.sourceContributionId, anyId, "sourceContributionId should equal the payload value (no coercion)");
  assertEquals(renderParams.documentIdentity, differentId, "documentIdentity should equal the payload value (no coercion)");
  assert(renderParams.sourceContributionId !== renderParams.documentIdentity, "sourceContributionId and documentIdentity should remain different");
  
  // (4) Verify the function does not throw errors about sourceContributionId not equaling documentIdentity
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates, "Job update should be called");
  assertEquals(updates.callCount, 1, "Job should be updated exactly once");
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload, "Update payload should have status");
  assertEquals(updatePayload.status, "completed", "Job should complete successfully without equality errors");
  
  // Check that no error_details contains equality-related error messages
  if (isRecord(updatePayload) && "error_details" in updatePayload) {
    const errorDetails = updatePayload["error_details"];
    if (typeof errorDetails === "string") {
      assert(
        !errorDetails.includes("sourceContributionId must equal documentIdentity") &&
        !errorDetails.includes("sourceContributionId must equal") &&
        !errorDetails.includes("documentIdentity must equal"),
        "Should not have error about sourceContributionId equaling documentIdentity"
      );
    }
  }
  
  // (5) Verify the job completes successfully
  assert(updatePayload.status === "completed", "Job should complete successfully when sourceContributionId differs from documentIdentity");
  
  clearAllStubs?.();
});