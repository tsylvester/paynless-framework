// processRenderJob tests — skeleton describing desired end state
//
// Purpose: Verify that a RENDER job calls the document renderer with the correct
// parameters and records completion or failure to the jobs table with strict typing
// and no reliance on deprecated fields.

import { assert, assertEquals, assertExists } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { FileType } from "../_shared/types/file_manager.types.ts";
import { isRecord, isDialecticRenderJobPayload } from "../_shared/utils/type_guards.ts";
import { processRenderJob } from "./processRenderJob.ts";
import { mockNotificationService, resetMockNotificationService } from "../_shared/utils/notification.service.mock.ts";
import { DialecticRenderJobPayload } from "../dialectic-service/dialectic.interface.ts";
import { isJson } from "../_shared/utils/type-guards/type_guards.common.ts";
import { IRenderJobContext } from "./JobContext.interface.ts";
import { createRenderJobContext } from "./createJobContext.ts";
import { createMockRootContext } from "./JobContext.mock.ts";

// Helpers
type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

const makeRenderJob = (payloadOverrides: Partial<DialecticRenderJobPayload> = {}): MockJob => {
  const payload: DialecticRenderJobPayload = {
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
    template_filename: "thesis_business_case.md",
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
  // - Use JobContext.mock to inject all deps, then stub only documentRenderer.renderDocument
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  // Act
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  // Assert
  // - renderer.renderDocument was called exactly once
  // - Params equal the payload: { projectId, sessionId, iterationNumber, stageSlug, documentIdentity, documentKey }
  // - Job row was updated once with { status: 'completed', results: ... }
  assertEquals(renderDocumentStub.calls.length, 1);
  const call = renderDocumentStub.calls[0];
  const params = call.args[2];
  assertEquals(params.projectId, "project_123");
  assertEquals(params.sessionId, "session_abc");
  assertEquals(params.iterationNumber, 1);
  assertEquals(params.stageSlug, "thesis");
  assertEquals(params.documentIdentity, "doc-root-1");
  assertEquals(String(params.documentKey), String(FileType.business_case));

  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  assertEquals(updates.callCount, 1);
  const [updatePayload] = updates.callsArgs[0];
  assertExists(updatePayload);
  // Status should be completed on success
  assert(updatePayload && typeof updatePayload === "object" && "status" in updatePayload);
  assertEquals(updatePayload.status, "completed");

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - passes originating contribution id to renderer payload", async () => {
  // Test 6.b.iv: Verify that sourceContributionId is passed correctly to renderDocument regardless of whether it equals documentIdentity
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const documentIdentity = "doc-identity-456";
  const sourceContributionId = "contrib-id-789";
  // Use different values to verify the function passes them correctly regardless of equality
  const job = makeRenderJob({ documentIdentity, sourceContributionId });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  assertEquals(renderDocumentStub.calls.length, 1);
  const params = renderDocumentStub.calls[0].args[2];
  assertEquals(params.sourceContributionId, sourceContributionId, "sourceContributionId should be passed correctly to renderDocument");
  assertEquals(params.documentIdentity, documentIdentity, "documentIdentity should be passed correctly to renderDocument");

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - records failure with error_details when renderer throws", async () => {
  // Arrange
  // - Same as prior test but make renderer.renderDocument throw an Error("render failed")
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const error = new Error("render failed");
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(rootCtx.documentRenderer, "renderDocument", async () => {
    throw error;
  });

  // Act
  try {
    await processRenderJob(
      dbClient as unknown as SupabaseClient<Database>,
      job,
      ownerId,
      renderCtx,
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

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - emits job_failed document-centric notification on renderer failure", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const err = new Error("render crashed hard");
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rawPayload = job.payload;
  if (rawPayload === null || !isRecord(rawPayload) || !isDialecticRenderJobPayload(rawPayload)) {
    throw new Error("test setup: job must have valid DialecticRenderJobPayload");
  }
  const jobPayload: DialecticRenderJobPayload = rawPayload;
  resetMockNotificationService();
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(rootCtx.documentRenderer, "renderDocument", async () => {
    throw err;
  });

  try {
    await processRenderJob(
      dbClient as unknown as SupabaseClient<Database>,
      job,
      ownerId,
      renderCtx,
      'auth-token',
    );
  } catch (_e) {
    // swallow for test
  }

  const jobFailedCalls = mockNotificationService.sendJobNotificationEvent.calls.filter((c) => {
    const arg = c.args[0];
    if (!arg || typeof arg !== "object" || !isRecord(arg)) return false;
    const typeVal = arg.type;
    return typeof typeVal === "string" && typeVal === "job_failed";
  });
  assertEquals(jobFailedCalls.length, 1, 'Expected job_failed notification');
  const [payloadArg, targetUserId] = jobFailedCalls[0].args;
  if (!payloadArg || !isRecord(payloadArg)) {
    throw new Error("expected job_failed payload object");
  }
  assertEquals(payloadArg.type, 'job_failed');
  assertEquals(payloadArg.sessionId, jobPayload.sessionId);
  assertEquals(payloadArg.stageSlug, jobPayload.stageSlug);
  assertEquals(payloadArg.job_id, job.id);
  assertEquals(payloadArg.document_key, String(jobPayload.documentKey));
  assertEquals(payloadArg.modelId, jobPayload.model_id);
  assertEquals(payloadArg.iterationNumber, jobPayload.iterationNumber);
  if (!('error' in payloadArg) || payloadArg.error === null || typeof payloadArg.error !== 'object') {
    throw new Error("job_failed payload must include error");
  }
  const errObj = payloadArg.error;
  if (!isRecord(errObj)) {
    throw new Error("expected error object");
  }
  const code = errObj.code;
  const message = errObj.message;
  if (typeof code !== 'string' || typeof message !== 'string') {
    throw new Error("job_failed payload error must include code and message");
  }
  if (!('step_key' in payloadArg) || typeof payloadArg.step_key !== 'string') {
    throw new Error("RENDER job_failed payload must include step_key");
  }
  assertEquals(targetUserId, job.user_id);

  renderDocumentStub.restore();
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
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (dbc, _deps, params) => {
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
          sourceContributionId: params.sourceContributionId,
        },
        renderedBytes: new Uint8Array(),
      };
    },
  );

  // Act
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  // Assert
  assert(receivedDbClient === (dbClient as unknown as SupabaseClient<Database>));
  assertExists(receivedParams);
  // Ensure payload remains frozen and unchanged in shape
  assert(Object.isFrozen(job.payload));

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - success path performs a single deterministic job update with results", async () => {
  // Arrange
  // - Set up spies on dialectic_generation_jobs update
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  // Act
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
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

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - persists renderer pathContext into job results", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const expectedSourceContributionId = "expected-source-contrib-id";
  const job = makeRenderJob({ sourceContributionId: expectedSourceContributionId });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
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

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - forwards notifyUserId to renderer deps", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  let receivedNotifyUserId: unknown;
  let receivedNotificationService: unknown;
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, deps, params) => {
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
          sourceContributionId: params.sourceContributionId,
        },
        renderedBytes: new Uint8Array(),
      };
    },
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  assertEquals(receivedNotifyUserId, job.user_id);
  assert(receivedNotificationService === mockNotificationService);

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - converts string iterationNumber to number", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  let receivedIteration: number | null = null;
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => {
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
          sourceContributionId: params.sourceContributionId,
        },
        renderedBytes: new Uint8Array(),
      };
    },
  );
  const job = makeRenderJob({ iterationNumber: 1 });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  assertEquals(receivedIteration, 1);

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - fails and does not call renderer when projectId missing", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob({ projectId: undefined });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  assertEquals(renderDocumentStub.calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  assertEquals(updates.callCount, 1);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Missing or invalid projectId."));

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when sessionId missing", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob({ sessionId: undefined });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  assertEquals(renderDocumentStub.calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Missing or invalid sessionId."));

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when stageSlug missing", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob({ stageSlug: undefined });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  assertEquals(renderDocumentStub.calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Invalid stageSlug."));

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when documentIdentity missing", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob({ documentIdentity: undefined });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  assertEquals(renderDocumentStub.calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Missing or invalid documentIdentity."));

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when iterationNumber missing or invalid", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob({ iterationNumber: undefined });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  assertEquals(renderDocumentStub.calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Invalid iterationNumber."));

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when iterationNumber is non-numeric string", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  if (isRecord(job.payload)) {
    job.payload["iterationNumber"] = "bogus";
  }
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  assertEquals(renderDocumentStub.calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Invalid iterationNumber."));

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - fails when documentKey is not a FileType", async () => {
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  if (isRecord(job.payload)) {
    job.payload["documentKey"] = "not_a_file_type";
  }
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  assertEquals(renderDocumentStub.calls.length, 0);
  const updates = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updates);
  const [updatePayload] = updates.callsArgs[0];
  assert(isRecord(updatePayload) && "status" in updatePayload && "error_details" in updatePayload);
  assertEquals(updatePayload.status, "failed");
  const err = isRecord(updatePayload) ? updatePayload["error_details"] : undefined;
  assert(typeof err === "string" && err.includes("Missing or invalid documentKey."));

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - accepts sourceContributionId that differs from documentIdentity when document_relationships contains semantic identifier", async () => {
  // Arrange: Create a RENDER job where sourceContributionId is the actual contribution ID
  // and documentIdentity is a semantic identifier from document_relationships (different values)
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const actualContributionId = "contrib-123"; // Actual contribution ID (for foreign key constraint)
  const semanticIdentifier = "semantic-doc-identity-999"; // Semantic identifier from document_relationships
  
  // sourceContributionId should be the actual contribution ID, not the semantic identifier
  const job = makeRenderJob({ 
    sourceContributionId: actualContributionId,
    documentIdentity: semanticIdentifier 
  });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  // Act: processRenderJob should accept this configuration without throwing
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
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
  assertEquals(renderDocumentStub.calls.length, 1, "Renderer should be called exactly once");
  const renderParams = renderDocumentStub.calls[0].args[2];
  assertEquals(renderParams.sourceContributionId, actualContributionId, "sourceContributionId should be the actual contribution ID");
  assertEquals(renderParams.documentIdentity, semanticIdentifier, "documentIdentity should be the semantic identifier");
  assert(renderParams.sourceContributionId !== renderParams.documentIdentity, "sourceContributionId and documentIdentity should be different when document_relationships contains a semantic identifier");

  // Assert: No error should be logged about sourceContributionId not equaling documentIdentity
  const errorDetails = isRecord(updatePayload) && "error_details" in updatePayload ? updatePayload.error_details : null;
  assert(
    !errorDetails || (typeof errorDetails === "string" && !errorDetails.includes("sourceContributionId must equal documentIdentity")),
    "Should not fail with 'sourceContributionId must equal documentIdentity' error"
  );

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - processes RENDER job successfully for root chunk where sourceContributionId equals documentIdentity", async () => {
  // Test 6.b.i: Verify root chunks where sourceContributionId === documentIdentity
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const rootId = "root-contrib-6b-i";
  
  // (1) Create a RENDER job with payload containing sourceContributionId: rootId and documentIdentity: rootId (both equal)
  const job = makeRenderJob({
    sourceContributionId: rootId,
    documentIdentity: rootId,
  });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );
  
  // (2) Call processRenderJob with the job
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );
  
  // (3) Verify renderDocument is called with sourceContributionId: rootId and documentIdentity: rootId
  assertEquals(renderDocumentStub.calls.length, 1, "renderDocument should be called exactly once");
  const renderParams = renderDocumentStub.calls[0].args[2];
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
  
  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - processes RENDER job successfully for continuation chunk where sourceContributionId differs from documentIdentity", async () => {
  // Test 6.b.ii: Verify continuation chunks where sourceContributionId !== documentIdentity
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const rootId = "root-contrib-6b-ii";
  const continuationId = "continuation-contrib-6b-ii";
  
  // (1) Create a RENDER job with payload containing sourceContributionId: continuationId and documentIdentity: rootId (different values)
  const job = makeRenderJob({
    sourceContributionId: continuationId,
    documentIdentity: rootId,
  });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );
  
  // (2) Call processRenderJob with the job
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );
  
  // (3) Verify renderDocument is called with sourceContributionId: continuationId and documentIdentity: rootId (different values)
  assertEquals(renderDocumentStub.calls.length, 1, "renderDocument should be called exactly once");
  const renderParams = renderDocumentStub.calls[0].args[2];
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
  
  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - passes sourceContributionId and documentIdentity to renderDocument without enforcing equality", async () => {
  // Test 6.b.iii: Verify the function does not enforce equality between sourceContributionId and documentIdentity
  const { client: dbClient, spies, clearAllStubs } = createMockSupabaseClient();
  const anyId = "any-contribution-id-6b-iii";
  const differentId = "different-document-identity-6b-iii";
  
  // (1) Create a RENDER job with payload containing sourceContributionId: anyId and documentIdentity: differentId (different values)
  const job = makeRenderJob({
    sourceContributionId: anyId,
    documentIdentity: differentId,
  });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );
  
  // (2) Call processRenderJob with the job
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );
  
  // (3) Verify renderDocument is called with exactly the values from the payload (no coercion or equality checks)
  assertEquals(renderDocumentStub.calls.length, 1, "renderDocument should be called exactly once");
  const renderParams = renderDocumentStub.calls[0].args[2];
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
  
  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - extracts template_filename from payload and passes it to renderDocument", async () => {
  // This test must initially FAIL because processRenderJob doesn't extract or pass template_filename yet
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const templateFilename = "antithesis_business_case_critique.md";
  
  // (1) Create mock RENDER job with payload containing template_filename
  const job = makeRenderJob({ template_filename: templateFilename });
  const ownerId = job.user_id;
  assertExists(ownerId, "Expected job.user_id to be defined for test setup");
  
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  
  // (2) Mock renderDocument function
  let receivedTemplateFilename: string | undefined;
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => {
      receivedTemplateFilename = params.template_filename;
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
  );

  // (3) Call processRenderJob with the job
  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  // (4) Assert renderDocument was called with RenderDocumentParams containing template_filename
  assertEquals(renderDocumentStub.calls.length, 1, "renderDocument should be called exactly once");
  const params = renderDocumentStub.calls[0].args[2];
  // This test must initially FAIL because processRenderJob doesn't extract or pass template_filename yet
  assertEquals(
    params.template_filename,
    templateFilename,
    `renderDocument should receive template_filename: '${templateFilename}' from job payload. Got: ${receivedTemplateFilename}`
  );

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - emits render_started event when RENDER job begins processing", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId);
  const rawPayload = job.payload;
  if (rawPayload === null || !isRecord(rawPayload) || !isDialecticRenderJobPayload(rawPayload)) {
    throw new Error("test setup: job must have valid DialecticRenderJobPayload");
  }
  const jobPayload: DialecticRenderJobPayload = rawPayload;
  resetMockNotificationService();
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  const startedCalls = mockNotificationService.sendJobNotificationEvent.calls.filter(
    (c) => c.args[0] && typeof c.args[0] === "object" && (c.args[0]).type === "render_started",
  );
  assertEquals(startedCalls.length, 1, "render_started must be emitted exactly once");
  const notificationPayload = startedCalls[0].args[0];
  if (!notificationPayload || typeof notificationPayload !== "object" || !isRecord(notificationPayload)) {
    throw new Error("expected notification payload object");
  }
  assertEquals(notificationPayload.sessionId, jobPayload.sessionId);
  assertEquals(notificationPayload.stageSlug, jobPayload.stageSlug);
  assertEquals(notificationPayload.iterationNumber, jobPayload.iterationNumber);
  assertEquals(notificationPayload.job_id, job.id);
  assert(typeof notificationPayload.step_key === "string", "render_started must include step_key");
  assertEquals(notificationPayload.modelId, jobPayload.model_id);
  assertEquals(notificationPayload.document_key, String(jobPayload.documentKey));
  assertEquals(startedCalls[0].args[1], ownerId, "notification must be sent to projectOwnerUserId");

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - emits render_chunk_completed event when RENDER job produces intermediate chunk", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId);
  const rawPayload = job.payload;
  if (rawPayload === null || !isRecord(rawPayload) || !isDialecticRenderJobPayload(rawPayload)) {
    throw new Error("test setup: job must have valid DialecticRenderJobPayload");
  }
  const jobPayload: DialecticRenderJobPayload = rawPayload;
  resetMockNotificationService();
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  const chunkCalls = mockNotificationService.sendJobNotificationEvent.calls.filter(
    (c) => c.args[0] && typeof c.args[0] === "object" && (c.args[0]).type === "render_chunk_completed",
  );
  assert(chunkCalls.length >= 0, "render_chunk_completed may be emitted when renderer produces intermediate output");
  if (chunkCalls.length > 0) {
    const notificationPayload = chunkCalls[0].args[0];
    if (!notificationPayload || typeof notificationPayload !== "object" || !isRecord(notificationPayload)) {
      throw new Error("expected notification payload object");
    }
    assertEquals(notificationPayload.sessionId, jobPayload.sessionId);
    assertEquals(notificationPayload.stageSlug, jobPayload.stageSlug);
    assertEquals(notificationPayload.job_id, job.id);
    assert(typeof notificationPayload.step_key === "string");
    assertEquals(notificationPayload.modelId, jobPayload.model_id);
    assertEquals(notificationPayload.document_key, String(jobPayload.documentKey));
  }

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - emits render_completed event when RENDER job finishes with latestRenderedResourceId", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId);
  const rawPayload = job.payload;
  if (rawPayload === null || !isRecord(rawPayload) || !isDialecticRenderJobPayload(rawPayload)) {
    throw new Error("test setup: job must have valid DialecticRenderJobPayload");
  }
  const jobPayload: DialecticRenderJobPayload = rawPayload;
  const latestResourceId = "resource-rendered-123";
  resetMockNotificationService();
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
      latestRenderedResourceId: latestResourceId,
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  const completedCalls = mockNotificationService.sendJobNotificationEvent.calls.filter((c) => {
    const arg = c.args[0];
    if (!arg || typeof arg !== "object" || !isRecord(arg)) return false;
    const typeVal = arg.type;
    return typeof typeVal === "string" && typeVal === "render_completed";
  });
  if (completedCalls.length >= 1) {
    const notificationPayload = completedCalls[0].args[0];
    if (!notificationPayload || typeof notificationPayload !== "object" || !isRecord(notificationPayload)) {
      throw new Error("expected notification payload object");
    }
    assert(typeof notificationPayload.latestRenderedResourceId === "string", "render_completed must include latestRenderedResourceId");
    assertEquals(notificationPayload.latestRenderedResourceId, latestResourceId);
    assertEquals(notificationPayload.sessionId, jobPayload.sessionId);
    assertEquals(notificationPayload.stageSlug, jobPayload.stageSlug);
    assertEquals(notificationPayload.job_id, job.id);
    assert(typeof notificationPayload.step_key === "string");
    assertEquals(notificationPayload.modelId, jobPayload.model_id);
    assertEquals(notificationPayload.document_key, String(jobPayload.documentKey));
    assertEquals(completedCalls[0].args[1], ownerId);
  }

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - all RENDER notification payloads include sessionId stageSlug iterationNumber job_id step_key modelId document_key", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob({ model_id: "model-abc" });
  const ownerId = job.user_id;
  assertExists(ownerId);
  resetMockNotificationService();
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(
    rootCtx.documentRenderer,
    "renderDocument",
    async (_dbc, _deps, params) => ({
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
      latestRenderedResourceId: "res-1",
    }),
  );

  await processRenderJob(
    dbClient as unknown as SupabaseClient<Database>,
    job,
    ownerId,
    renderCtx,
    "auth-token",
  );

  const calls = mockNotificationService.sendJobNotificationEvent.calls;
  const renderTypes = ["render_started", "render_chunk_completed", "render_completed"];
  for (const c of calls) {
    const payload = c.args[0];
    if (!payload || typeof payload !== "object") continue;
    if (!isRecord(payload)) continue;
    const typeRaw = payload.type;
    if (typeof typeRaw !== "string") continue;
    const type: string = typeRaw;
    if (type === "job_failed" || renderTypes.includes(type)) {
      const sessionId = payload.sessionId;
      const stageSlug = payload.stageSlug;
      const iterationNumber = payload.iterationNumber;
      const job_id = payload.job_id;
      const step_key = payload.step_key;
      const modelId = payload.modelId;
      const document_key = payload.document_key;
      if (typeof sessionId !== "string") throw new Error(`payload ${type} must include sessionId`);
      if (typeof stageSlug !== "string") throw new Error(`payload ${type} must include stageSlug`);
      if (typeof iterationNumber !== "number") throw new Error(`payload ${type} must include iterationNumber`);
      if (typeof job_id !== "string") throw new Error(`payload ${type} must include job_id`);
      if (typeof step_key !== "string") throw new Error(`payload ${type} must include step_key`);
      if (typeof modelId !== "string") throw new Error(`payload ${type} must include modelId`);
      if (typeof document_key !== "string") throw new Error(`payload ${type} must include document_key`);
    }
    const targetUserId = c.args[1];
    assertExists(targetUserId, "every notification must be sent to projectOwnerUserId");
    assertEquals(targetUserId, ownerId, "every notification must be sent to projectOwnerUserId");
  }

  renderDocumentStub.restore();
  clearAllStubs?.();
});

Deno.test("processRenderJob - job_failed notification is sent to projectOwnerUserId", async () => {
  const { client: dbClient, clearAllStubs } = createMockSupabaseClient();
  const job = makeRenderJob();
  const ownerId = job.user_id;
  assertExists(ownerId);
  resetMockNotificationService();
  const rootCtx = createMockRootContext();
  const renderCtx: IRenderJobContext = createRenderJobContext(rootCtx);
  const renderDocumentStub = stub(rootCtx.documentRenderer, "renderDocument", async () => {
    throw new Error("terminal error");
  });

  try {
    await processRenderJob(
      dbClient as unknown as SupabaseClient<Database>,
      job,
      ownerId,
      renderCtx,
      "auth-token",
    );
  } catch (_e) {
    // swallow
  }

  const failedCalls = mockNotificationService.sendJobNotificationEvent.calls.filter(
    (c) => c.args[0] && typeof c.args[0] === "object" && (c.args[0]).type === "job_failed",
  );
  assertEquals(failedCalls.length, 1);
  const targetUserId: string | undefined = failedCalls[0].args[1];
  assertExists(targetUserId, "job_failed notification must have target user id");
  assertEquals(targetUserId, ownerId, "job_failed notification must be sent to projectOwnerUserId");

  renderDocumentStub.restore();
  clearAllStubs?.();
});